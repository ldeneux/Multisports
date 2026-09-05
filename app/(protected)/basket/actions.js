import NavBar from "@/components/NavBar";

export default function ProtectedLayout({ children }) {
  return (
    <div className="min-h-screen bg-sand">
      <NavBar />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
