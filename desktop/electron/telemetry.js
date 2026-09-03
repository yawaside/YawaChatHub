// Телеметрия Windows для отдельного overlay: CPU, дискретный GPU и температуры.
// Никаких драйверов и внешних SDK: CPU usage вычисляется из os.cpus(),
// температура CPU — WMI, NVIDIA GPU — nvidia-smi. На ноутбуке выбирается
// только дискретная видеокарта (NVIDIA/AMD), встроенная Intel намеренно игнорируется.

const os = require("os");
const { execFile } = require("child_process");

const POLL_MS = 2000;
const POWERSHELL = process.platform === "win32" ? "powershell.exe" : "";
const PS_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

function asNumber(value) {
  const n = Number(String(value ?? "").trim().replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function run(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    if (!cmd) return resolve("");
    execFile(cmd, args, { windowsHide: true, timeout }, (error, stdout) => {
      resolve(error ? "" : String(stdout || "").trim());
    });
  });
}

function isDiscreteName(name) {
  return /nvidia|geforce|rtx|gtx|quadro|amd|radeon/i.test(String(name || "")) && !/intel|iris|uhd/i.test(String(name || ""));
}

class TelemetryService {
  constructor({ onUpdate } = {}) {
    this.onUpdate = onUpdate || (() => {});
    this.timer = null;
    this.previousCpu = null;
    this.snapshot = {
      updatedAt: 0,
      cpu: { usage: null, temperature: null },
      gpu: { name: null, usage: null, temperature: null, discrete: false },
    };
    this.gpuInfo = { name: null, discrete: false };
  }

  start() {
    if (this.timer) return;
    this.sample();
    this.timer = setInterval(() => this.sample(), POLL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  readCpuUsage() {
    const cpus = os.cpus();
    const now = cpus.map((cpu) => {
      const t = cpu.times;
      return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
    });
    if (!this.previousCpu || this.previousCpu.length !== now.length) {
      this.previousCpu = now;
      return this.snapshot.cpu.usage;
    }
    let idle = 0;
    let total = 0;
    now.forEach((cur, i) => {
      const prev = this.previousCpu[i];
      idle += Math.max(0, cur.idle - prev.idle);
      total += Math.max(0, cur.total - prev.total);
    });
    this.previousCpu = now;
    return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : this.snapshot.cpu.usage;
  }

  async readCpuTemperature() {
    if (process.platform !== "win32") return null;

    // Источники перебираются по убыванию точности: MSAcpi_ThermalZoneTemperature
    // отключён на многих материнских платах, поэтому одного запроса недостаточно.
    // Каждая строка — самостоятельный однострочный PowerShell-скрипт.
    const sources = [
      // 1) LibreHardwareMonitor / OpenHardwareMonitor — точный датчик CPU Package.
      "$ErrorActionPreference='SilentlyContinue'; " +
        "foreach($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')){ " +
        "$s=Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.SensorType -eq 'Temperature' -and $_.Name -match 'CPU' }; " +
        "if($s){ $m=$s | Measure-Object -Property Value -Maximum; " +
        "if($m.Maximum -gt 0){ [math]::Round($m.Maximum); break } } }",

      // 2) Классическая ACPI-зона: значение в десятых долях Kelvin.
      "$ErrorActionPreference='SilentlyContinue'; " +
        "$x=Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature; " +
        "$v=$x | ForEach-Object { ($_.CurrentTemperature / 10) - 273.15 } | " +
        "Where-Object { $_ -gt 20 -and $_ -lt 130 } | Measure-Object -Maximum; " +
        "if($v.Maximum){ [math]::Round($v.Maximum) }",

      // 3) Счётчик термозоны — работает там, где ACPI-класс пуст.
      "$ErrorActionPreference='SilentlyContinue'; " +
        "$t=Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation; " +
        "$v=$t | ForEach-Object { ($_.HighPrecisionTemperature / 10) - 273.15 } | " +
        "Where-Object { $_ -gt 20 -and $_ -lt 130 } | Measure-Object -Maximum; " +
        "if($v.Maximum){ [math]::Round($v.Maximum) }",

      // 4) Последний шанс — датчик из WMI-провайдера ACPI.
      "$ErrorActionPreference='SilentlyContinue'; " +
        "$z=Get-CimInstance -ClassName Win32_TemperatureProbe | Where-Object { $_.CurrentReading -gt 0 }; " +
        "$v=$z | ForEach-Object { ($_.CurrentReading / 10) - 273.15 } | " +
        "Where-Object { $_ -gt 20 -and $_ -lt 130 } | Measure-Object -Maximum; " +
        "if($v.Maximum){ [math]::Round($v.Maximum) }",
    ];

    for (const script of sources) {
      // eslint-disable-next-line no-await-in-loop
      const value = asNumber(await run(POWERSHELL, PS_ARGS.concat(script)));
      if (value !== null && value > 20 && value < 130) return value;
    }
    return null;
  }

  /**
   * Загрузка и температура дискретного GPU через LibreHardwareMonitor.
   * Нужно для AMD Radeon: у неё нет аналога nvidia-smi.
   */
  async readGpuFromMonitor() {
    if (process.platform !== "win32") return null;
    const script =
      "$ErrorActionPreference='SilentlyContinue'; " +
      "foreach($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')){ " +
      "$s=Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue | " +
      "Where-Object { $_.Identifier -match 'gpu' -and $_.Name -notmatch 'Intel' }; " +
      "if($s){ " +
      "$t=$s | Where-Object { $_.SensorType -eq 'Temperature' -and $_.Name -match 'Core|GPU' } | " +
      "Measure-Object -Property Value -Maximum; " +
      "$l=$s | Where-Object { $_.SensorType -eq 'Load' -and $_.Name -match 'Core|GPU' } | " +
      "Measure-Object -Property Value -Maximum; " +
      "\"$([math]::Round($l.Maximum));$([math]::Round($t.Maximum))\"; break } }";
    const raw = await run(POWERSHELL, PS_ARGS.concat(script));
    if (!raw) return null;
    const [load, temp] = raw.split(";").map((part) => asNumber(part));
    if (load === null && temp === null) return null;
    return { usage: load, temperature: temp };
  }

  async resolveGpu() {
    if (process.platform !== "win32") return this.gpuInfo;
    const script = [
      "$ErrorActionPreference='SilentlyContinue'",
      "$portable=(Get-CimInstance Win32_SystemEnclosure).ChassisTypes | Where-Object { $_ -in 8,9,10,14,30,31,32 }",
      "$g=Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
      "$discrete=$g | Where-Object { $_ -match 'NVIDIA|GeForce|RTX|GTX|Quadro|AMD|Radeon' -and $_ -notmatch 'Intel|Iris|UHD' }",
      "$pick=$discrete | Select-Object -First 1",
      "if(-not $portable -and -not $pick){$pick=$g | Select-Object -First 1}",
      "if($pick){$pick}",
    ].join("; ");
    const name = await run(POWERSHELL, PS_ARGS.concat(script));
    this.gpuInfo = { name: name || null, discrete: isDiscreteName(name) };
    return this.gpuInfo;
  }

  async readNvidia() {
    // nvidia-smi существует только при драйвере NVIDIA; в ноутбуке это всегда dGPU.
    const raw = await run("nvidia-smi.exe", ["--query-gpu=name,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"], 5000);
    if (!raw) return null;
    const first = raw.split(/\r?\n/).find(Boolean);
    if (!first) return null;
    const [name, usage, temperature] = first.split(",").map((part) => part.trim());
    return {
      name: name || null,
      usage: asNumber(usage),
      temperature: asNumber(temperature),
      discrete: true,
    };
  }

  async sample() {
    try {
      const cpuUsage = this.readCpuUsage();
      const [cpuTemp, gpuInfo, nvidia] = await Promise.all([
        this.readCpuTemperature(),
        this.gpuInfo.name ? Promise.resolve(this.gpuInfo) : this.resolveGpu(),
        this.readNvidia(),
      ]);

      // NVIDIA отдаёт usage/temp напрямую через nvidia-smi.
      // Для AMD Radeon аналога нет, поэтому пробуем LibreHardwareMonitor.
      let gpu;
      if (nvidia) {
        gpu = nvidia;
      } else {
        const monitor = await this.readGpuFromMonitor();
        gpu = {
          name: gpuInfo.name,
          usage: monitor?.usage ?? null,
          temperature: monitor?.temperature ?? null,
          discrete: gpuInfo.discrete,
        };
      }
      this.snapshot = {
        updatedAt: Date.now(),
        cpu: { usage: cpuUsage ?? null, temperature: cpuTemp },
        gpu,
      };
      this.onUpdate(this.snapshot);
    } catch {
      // Не прекращаем обновления из-за одного неудачного WMI/nvidia-smi вызова.
      this.snapshot = { ...this.snapshot, updatedAt: Date.now() };
      this.onUpdate(this.snapshot);
    }
  }
}

module.exports = { TelemetryService };
