/** Saves a text file: via the share sheet where available (mobile), otherwise as a download. */
export async function saveFile(name: string, content: string): Promise<"shared" | "downloaded"> {
  const file = new File([content], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
