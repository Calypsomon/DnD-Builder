import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ContentProvider } from "./api/content";
import { cx } from "./components/ui";
import CatalogPage from "./pages/CatalogPage";
import CharacterListPage from "./pages/CharacterListPage";
import CharacterPage from "./pages/CharacterPage";
import HomebrewPage from "./pages/HomebrewPage";
import SettingsPage from "./pages/SettingsPage";

const NAV = [
  { to: "/characters", label: "Characters" },
  { to: "/catalog", label: "Catalog" },
  { to: "/homebrew", label: "Homebrew" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center gap-6 px-3 py-1">
          <NavLink to="/characters" className="font-serif text-lg font-bold text-accent">
            D&amp;D Builder
          </NavLink>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx("rounded-md px-3 py-1.5 text-sm font-medium", isActive ? "bg-accent-soft text-accent" : "text-muted hover:text-fg")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1800px] flex-1 px-3 py-3">
        <ContentProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/characters" replace />} />
            <Route path="/characters" element={<CharacterListPage />} />
            <Route path="/characters/:id/*" element={<CharacterPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/homebrew" element={<HomebrewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/characters" replace />} />
          </Routes>
        </ContentProvider>
      </main>
    </div>
  );
}
