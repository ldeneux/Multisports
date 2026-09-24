import NavBar from "@/components/NavBar";

export default function ProtectedLayout({ children }) {
  return (
    <div className="min-h-screen bg-sand flex">
      <NavBar />
      <main className="flex-1 min-w-0 mx-auto max-w-5xl px-4 py-8 pb-24 sm:pb-8">{children}</main>
    </div>
  );
}
