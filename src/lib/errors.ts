export class BillParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillParseError'
  }
}
