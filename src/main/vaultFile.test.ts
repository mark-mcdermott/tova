import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

const paths = vi.hoisted(() => ({ userData: "", vault: "" }))
const keychain = vi.hoisted(() => ({ available: true }))

vi.mock("electron", () => ({
  app: { getPath: () => paths.userData },
  safeStorage: {
    isEncryptionAvailable: () => keychain.available,
    // Not the real keychain, but the same shape: something only this machine
    // can undo. Reversing the bytes is enough to tell "wrapped" from "not".
    encryptString: (value: string) => Buffer.from(value).reverse(),
    decryptString: (value: Buffer) => Buffer.from(value).reverse().toString()
  }
}))

vi.mock("./vault", () => ({ vaultRoot: () => paths.vault }))

const { encryptVault, decryptVault, readVaultText, writeVaultText, readVaultBytes } =
  await import("./vaultFile")
const { isVaultEncrypted, keyFor, lockVault, unlockVault, unlockWithRecoveryKey } =
  await import("./vaultKeys")
const { looksEncrypted } = await import("./crypto")

const created: string[] = []
const NOTE = "---\ntitle: Slow Morning\n---\n\nCoffee. Empty streets.\n"

async function note(name: string, body = NOTE): Promise<string> {
  const path = join(paths.vault, "notes", name)
  await mkdir(join(paths.vault, "notes"), { recursive: true })
  await writeFile(path, body, "utf-8")
  return path
}

beforeEach(async () => {
  keychain.available = true
  paths.userData = await mkdtemp(join(tmpdir(), "tova-keys-"))
  paths.vault = await mkdtemp(join(tmpdir(), "tova-vault-"))
  created.push(paths.userData, paths.vault)
})

afterAll(async () => {
  for (const path of created) await rm(path, { recursive: true, force: true })
})

describe("a vault nobody has sealed", () => {
  it("reads and writes its files as themselves", async () => {
    const path = await note("slow-morning.md")

    expect(await readVaultText(path)).toBe(NOTE)
    await writeVaultText(path, "Changed.")
    expect(await readFile(path, "utf-8")).toBe("Changed.")
  })
})

describe("sealing a vault", () => {
  it("leaves nothing readable on disk", async () => {
    const path = await note("slow-morning.md")
    await encryptVault(paths.vault)

    const onDisk = await readFile(path, "utf-8")
    expect(onDisk).not.toContain("Coffee")
    expect(onDisk).not.toContain("Slow Morning")
    expect(looksEncrypted(onDisk)).toBe(true)
  })

  it("still reads back as what was written", async () => {
    const path = await note("slow-morning.md")
    await encryptVault(paths.vault)

    expect(await readVaultText(path)).toBe(NOTE)
  })

  it("seals what it finds in every folder, pictures included", async () => {
    const deep = join(paths.vault, "posts", "a-blog", "assets")
    await mkdir(deep, { recursive: true })
    const image = join(deep, "shot.png")
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))

    await encryptVault(paths.vault)

    expect(looksEncrypted(await readFile(image, "utf-8"))).toBe(true)
    expect([...(await readVaultBytes(image))]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d])
  })

  it("seals what is written afterwards too", async () => {
    await encryptVault(paths.vault)
    const path = await note("later.md", "written after")
    await writeVaultText(path, "written after")

    expect(looksEncrypted(await readFile(path, "utf-8"))).toBe(true)
    expect(await readVaultText(path)).toBe("written after")
  })

  it("finishes a job it did not get to the end of", async () => {
    // A crash partway leaves a vault that says it is encrypted holding notes
    // that are not. Running it again seals the stragglers with the key that is
    // already there, rather than refusing and leaving them in plain sight.
    const path = await note("slow-morning.md")
    await encryptVault(paths.vault)
    const straggler = await note("missed.md", "never got sealed")

    expect(await encryptVault(paths.vault)).toBeNull()
    expect(looksEncrypted(await readFile(straggler, "utf-8"))).toBe(true)
    expect(await readVaultText(straggler)).toBe("never got sealed")
    expect(await readVaultText(path)).toBe(NOTE)
  })

  it("will not finish one it cannot open", async () => {
    await encryptVault(paths.vault)
    await note("missed.md", "never got sealed")
    lockVault(paths.vault)
    keychain.available = false

    await expect(encryptVault(paths.vault)).rejects.toThrow(/unlocked/)
  })
})

describe("opening a sealed vault again", () => {
  it("opens itself on the machine that sealed it", async () => {
    const path = await note("slow-morning.md")
    await encryptVault(paths.vault)
    lockVault(paths.vault)

    expect(await unlockVault(paths.vault)).toBe(true)
    expect(await readVaultText(path)).toBe(NOTE)
  })

  it("will not read a thing while it is locked", async () => {
    const path = await note("slow-morning.md")
    await encryptVault(paths.vault)
    lockVault(paths.vault)
    keychain.available = false

    expect(await unlockVault(paths.vault)).toBe(false)
    await expect(readVaultText(path)).rejects.toThrow(/unlocked/)
  })

  it("opens with what was written down, on a machine that never saw it", async () => {
    const path = await note("slow-morning.md")
    const recoveryKey = await encryptVault(paths.vault)
    expect(recoveryKey).not.toBeNull()

    // A different machine: no keychain to remember anything.
    lockVault(paths.vault)
    keychain.available = false
    await rm(join(paths.userData, "vault-keys.json"), { force: true })

    expect(await unlockWithRecoveryKey(paths.vault, recoveryKey as string)).toBe(true)
    expect(await readVaultText(path)).toBe(NOTE)
  })

  it("takes the recovery key however it was copied down", async () => {
    const recoveryKey = await encryptVault(paths.vault)
    lockVault(paths.vault)

    expect(await unlockWithRecoveryKey(paths.vault, String(recoveryKey).toLowerCase())).toBe(true)
  })

  it("says no to the wrong recovery key rather than throwing", async () => {
    await encryptVault(paths.vault)
    lockVault(paths.vault)

    expect(await unlockWithRecoveryKey(paths.vault, "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF")).toBe(false)
    expect(keyFor(paths.vault)).toBeNull()
  })
})

describe("unsealing a vault", () => {
  it("puts the files back as they were", async () => {
    const path = await note("slow-morning.md")
    await encryptVault(paths.vault)
    await decryptVault(paths.vault)

    expect(await readFile(path, "utf-8")).toBe(NOTE)
    expect(await isVaultEncrypted(paths.vault)).toBe(false)
  })

  it("keeps the key until the last file no longer needs it", async () => {
    // Removed first, a run that stopped halfway would leave a vault full of
    // sealed files and no way left to open them.
    const path = await note("slow-morning.md")
    await encryptVault(paths.vault)
    await decryptVault(paths.vault)

    expect(await readVaultText(path)).toBe(NOTE)
  })

  it("refuses one it cannot open", async () => {
    await encryptVault(paths.vault)
    lockVault(paths.vault)
    keychain.available = false

    await expect(decryptVault(paths.vault)).rejects.toThrow(/unlocked/)
  })
})
