import { CATALOG_NAMES, useStore } from "../store.tsx";

export type CatalogId = keyof typeof CATALOG_NAMES;

/** The building type in use (Wohngebäude/Nichtwohngebäude), limited to imported ones. */
export function useCatalog(): { catalog: CatalogId; available: CatalogId[] } {
  const { settings, catalogs } = useStore();
  const available = (["WG", "NWG"] as const).filter((c) => catalogs.some((x) => x.id.startsWith(`${c}-`)));
  return { catalog: available.includes(settings.catalog) ? settings.catalog : available[0]!, available };
}

export function CatalogSwitch() {
  const { updateSettings } = useStore();
  const { catalog, available } = useCatalog();
  if (available.length < 2) return null;
  return (
    <div className="segmented">
      {available.map((c) => (
        <button key={c} className={c === catalog ? "selected" : ""} onClick={() => updateSettings({ catalog: c })}>
          {CATALOG_NAMES[c]}
        </button>
      ))}
    </div>
  );
}
