import { FormulasScreen } from "./screens/FormulasScreen.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { ImportScreen } from "./screens/ImportScreen.tsx";
import { LearnScreen } from "./screens/LearnScreen.tsx";
import { QuestionScreen } from "./screens/QuestionScreen.tsx";
import { ReviewScreen } from "./screens/ReviewScreen.tsx";
import { SettingsScreen } from "./screens/SettingsScreen.tsx";
import { href, useRoute } from "./router.ts";
import { useStore } from "./store.tsx";

export function App() {
  const route = useRoute();
  const { catalogs } = useStore();
  const [screen, ...rest] = route.path;

  let content;
  if (catalogs.length === 0 || screen === "import") content = <ImportScreen />;
  else if (screen === "learn") content = <LearnScreen route={route} />;
  else if (screen === "q") content = <QuestionScreen questionKey={rest.join("/")} />;
  else if (screen === "review") content = <ReviewScreen />;
  else if (screen === "formulas") content = <FormulasScreen />;
  else if (screen === "settings") content = <SettingsScreen />;
  else content = <HomeScreen />;

  return (
    <>
      <nav className="topbar">
        {screen ? (
          <a href={href("")} className="nav-button" aria-label="Zur Übersicht">
            ←
          </a>
        ) : (
          <span className="nav-button" />
        )}
        <a href={href("")} className="title">
          Prüfungstrainer Energieberatung
        </a>
        <a href={href("settings")} className="nav-button" aria-label="Einstellungen">
          ⚙
        </a>
      </nav>
      <main>{content}</main>
    </>
  );
}
