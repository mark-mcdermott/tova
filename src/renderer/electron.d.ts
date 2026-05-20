export {}

declare global {
  interface Window {
    electron: {
      writeTemp: (content: string) => Promise<string>
    }
  }
}