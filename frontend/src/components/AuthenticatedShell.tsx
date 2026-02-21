import { lazy, Suspense, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { BottomNavBar } from "./BottomNavBar";
import { BottomSheet } from "./ui/BottomSheet";
import { AgentSettingsModal } from "./AgentSettingsModal";
import { ProfileFactsModal } from "./profile/ProfileFactsModal";
import { TrashModal } from "./trash/TrashModal";

const CalendarModal = lazy(() => import("./calendar/CalendarModal").then((m) => ({ default: m.CalendarModal })));
import { GraphView } from "./GraphView";
import { ExportObsidianButton } from "./ExportObsidianButton";
import { useAppModalsStore } from "../store/appModalsStore";
import { useTreeStore } from "../store/treeStore";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useAddInputStore } from "../store/addInputStore";
import { useIsMobile, useIsNative } from "../hooks/useIsMobile";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";
import { useOfflineSync } from "../hooks/useOfflineSync";

export function AuthenticatedShell() {
  const token = useAuthStore((s) => s.token);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const {
    settingsOpen,
    profileOpen,
    calendarOpen,
    trashOpen,
    graphOpen,
    moreSheetOpen,
    setCommandPaletteOpen,
    setSettingsOpen,
    setProfileOpen,
    setCalendarOpen,
    setTrashOpen,
    setGraphOpen,
    setMoreSheetOpen,
  } = useAppModalsStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const isMobile = useIsMobile();
  const isNative = useIsNative();
  const navigate = useNavigate();
  const location = useLocation();
  const focusAddInput = useAddInputStore((s) => s.focus);
  useRegisterOverlay(moreSheetOpen, () => setMoreSheetOpen(false));
  useOfflineSync();

  useEffect(() => {
    import("@capacitor/core").then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      import("@capacitor/app").then(({ App }) => {
        App.getLaunchUrl().then((r) => {
          if (r?.url?.includes("add-voice")) {
            setSelectedNote(null);
            if (location.pathname !== "/") navigate("/");
            setTimeout(() => focusAddInput?.(), 300);
          }
        });
      });
    });
  }, [navigate, focusAddInput, setSelectedNote, location.pathname]);

  const handleAddClick = () => {
    setSelectedNote(null);
    if (location.pathname !== "/") {
      navigate("/");
    }
    setTimeout(() => focusAddInput?.(), 150);
  };

  if (!token) return null;

  const closeMoreAndOpen = (openFn: () => void) => {
    setMoreSheetOpen(false);
    openFn();
  };

  return (
    <>
      <div className="h-screen-fill flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
        {isMobile && (
        <>
          <BottomNavBar
            onAddClick={handleAddClick}
            onMoreClick={() => setMoreSheetOpen(true)}
          />
          <BottomSheet
            open={moreSheetOpen}
            onClose={() => setMoreSheetOpen(false)}
            maxHeight="50dvh"
            showHeader={false}
          >
            <div className="p-4 space-y-1">
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-accent hover:bg-accent-muted flex items-center gap-3 font-medium"
                onClick={() => closeMoreAndOpen(() => setCommandPaletteOpen(true))}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span>Поиск и команды</span>
              </button>
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                onClick={() => {
                  setMoreSheetOpen(false);
                  navigate("/chat");
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Обсудить</span>
              </button>
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                onClick={() => closeMoreAndOpen(() => setSettingsOpen(true))}
              >
                <span>Настройки агентов</span>
              </button>
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                onClick={() => closeMoreAndOpen(() => setProfileOpen(true))}
              >
                <span>Память модели</span>
              </button>
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                onClick={() => closeMoreAndOpen(() => setCalendarOpen(true))}
              >
                <span>Календарь</span>
              </button>
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                onClick={() => closeMoreAndOpen(() => setGraphOpen(true))}
              >
                <span>Граф связей</span>
              </button>
              <ExportObsidianButton />
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                onClick={() => closeMoreAndOpen(() => setTrashOpen(true))}
              >
                <span>Корзина</span>
              </button>
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                onClick={() => toggleTheme()}
              >
                <span>{isDark ? "Светлая тема" : "Тёмная тема"}</span>
              </button>
              {isNative && (
                <button
                  type="button"
                  className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3"
                  onClick={() => {
                    setMoreSheetOpen(false);
                    logout();
                    navigate("/config-server");
                  }}
                >
                  <span>Сменить сервер</span>
                </button>
              )}
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-error hover:bg-error/10 flex items-center gap-3"
                onClick={() => {
                  setMoreSheetOpen(false);
                  logout();
                }}
              >
                <span>Выйти</span>
              </button>
            </div>
          </BottomSheet>
        </>
        )}
      </div>
      <AgentSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        token={token}
      />
      <ProfileFactsModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        token={token}
      />
      <Suspense fallback={null}>
        <CalendarModal
          open={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          token={token}
          onEventClick={(noteId) => setSelectedNote(noteId)}
        />
      </Suspense>
      <TrashModal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        token={token}
        onRestore={(noteId) => setSelectedNote(noteId)}
      />
      {graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}
    </>
  );
}
