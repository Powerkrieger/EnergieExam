import { QuestionView } from "../components/QuestionView.tsx";
import { useStore } from "../store.tsx";

export function QuestionScreen({ questionKey }: { questionKey: string }) {
  const q = useStore().byKey.get(questionKey);
  if (!q) return <div className="screen">Frage {questionKey} nicht gefunden.</div>;
  return (
    <div className="screen">
      <QuestionView question={q} />
    </div>
  );
}
