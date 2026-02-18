import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { BottomNavBar } from "./BottomNavBar";
import { BottomSheet } from "./ui/BottomSheet";
import { AgentSettingsModal } from "./AgentSettingsModal";
import { ProfileFactsModal } from "./profile/ProfileFactsModal";
import { CalendarModal } from "./calendar/CalendarModal";
import { TrashModal } from "./trash/TrashModal";
import { useAppModalsStore } from "../store/appModalsStore";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useTreeStore } from "../store/treeStore";
import { useAddInputStore } from "../store/addInputStore";
import { useIsMobile } from "../hooks/useIsMobile";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";

export function AuthenticatedShell() {
  const token = useAuthStore((s) => s.token);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const {
    settingsOpen,
    profileOpen,
    calendarOpen,
    trashOpen,
    moreSheetOpen,
    setSettingsOpen,
    setProfileOpen,
    setCalendarOpen,
    setTrashOpen,
    setMoreSheetOpen,
  } = useAppModalsStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const focusAddInput = useAddInputStore((s) => s.focus);
  useRegisterOverlay(moreSheetOpen, () => setMoreSheetOpen(false));

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
      <CalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        token={token}
        onEventClick={(noteId) => setSelectedNote(noteId)}
      />
      <TrashModal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        token={token}
        onRestore={(noteId) => setSelectedNote(noteId)}
      />
    </>
  );
}
