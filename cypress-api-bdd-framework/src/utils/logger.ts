export class Logger {
  constructor(private context: string) {}

  private log(level: string, message: string, meta?: unknown) {
    const timestamp = new Date().toISOString()
    const entry = `[${timestamp}] [${level}] [${this.context}] ${message}`
    if (meta) {
      console.log(entry, JSON.stringify(meta, null, 2))
    } else {
      console.log(entry)
    }
  }

  info(message: string, meta?: unknown) {
    this.log('INFO', message, meta)
  }

  warn(message: string, meta?: unknown) {
    this.log('WARN', message, meta)
  }

  error(message: string, meta?: unknown) {
    this.log('ERROR', message, meta)
  }

  debug(message: string, meta?: unknown) {
    this.log('DEBUG', message, meta)
  }
}
