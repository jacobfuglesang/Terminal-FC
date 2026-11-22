import NotesApp from "@/components/NotesApp";
import { listAll } from "@/lib/notes";

export const dynamic = "force-dynamic";

export default async function Notater() {
  let data: Awaited<ReturnType<typeof listAll>> = { folders: [], notes: [] };
  let error = "";
  try {
    data = await listAll();
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <>
      {error && <div className="empty" style={{ marginBottom: 12 }}>Fikk ikke kontakt med databasen: {error}</div>}
      <NotesApp initial={data} />
      <p className="note">Notatene lagres automatisk i databasen din mens du skriver, og bare du ser dem.</p>
    </>
  );
}
