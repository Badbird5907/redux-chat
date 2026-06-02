"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@redux/ui/components/resizable";
import { useIsMobile } from "@redux/ui/hooks/use-mobile";

import type { AdjacentPanelFile } from "./attachment-side-panel";
import type { PreviewableFile } from "./input/types";
import {
  ADJACENT_PANEL_DEFAULT_WIDTH,
  ADJACENT_PANEL_MAX_WIDTH,
  ADJACENT_PANEL_MIN_WIDTH,
  AttachmentSidePanel,
  getStoredAdjacentPanelLayout,
  isAdjacentPreviewSupported,
  persistAdjacentPanelLayout,
} from "./attachment-side-panel";

type AdjacentAttachmentPanelContextValue = {
  closeAllTabs: () => void;
  closeTab: (fileId: string) => void;
  isOpen: boolean;
  openAdjacentPreview: (file: PreviewableFile) => boolean;
  panelWidth: number;
};

const AdjacentAttachmentPanelContext =
  createContext<AdjacentAttachmentPanelContextValue | null>(null);

const MAIN_PANEL_ID = "main";
const ATTACHMENT_PANEL_ID = "attachment";

function AttachmentPanelSizer({
  children,
  onWidthChange,
}: {
  children: ReactNode;
  onWidthChange: (width: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const updateWidth = () => {
      onWidthChange(node.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [onWidthChange]);

  return (
    <div ref={containerRef} className="h-full min-h-0 min-w-0">
      {children}
    </div>
  );
}

export function useAdjacentAttachmentPanel() {
  const context = useContext(AdjacentAttachmentPanelContext);
  if (!context) {
    throw new Error(
      "useAdjacentAttachmentPanel must be used within AdjacentAttachmentPanelLayout",
    );
  }
  return context;
}

export function AdjacentAttachmentPanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [openFiles, setOpenFiles] = useState<AdjacentPanelFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const [defaultLayout] = useState(getStoredAdjacentPanelLayout);
  const isMobile = useIsMobile();

  const handlePanelWidthChange = useCallback((width: number) => {
    setPanelWidth(width);
  }, []);

  const closeTab = useCallback(
    (fileId: string) => {
      setOpenFiles((prev) => {
        const next = prev.filter((file) => file.id !== fileId);
        if (next.length === 0) {
          setActiveFileId(null);
        } else if (activeFileId === fileId) {
          const closedIndex = prev.findIndex((file) => file.id === fileId);
          const nextActive = next[Math.min(closedIndex, next.length - 1)];
          setActiveFileId(nextActive?.id ?? null);
        }
        return next;
      });
    },
    [activeFileId],
  );

  const closeAllTabs = useCallback(() => {
    setOpenFiles([]);
    setActiveFileId(null);
  }, []);

  const openAdjacentPreview = useCallback(
    (file: PreviewableFile) => {
      if (isMobile || !isAdjacentPreviewSupported(file)) {
        return false;
      }

      const panelFile: AdjacentPanelFile = {
        id: file.id,
        name: file.name,
        type: file.type,
        url: file.url,
      };

      setOpenFiles((prev) => {
        if (prev.some((existing) => existing.id === panelFile.id)) {
          return prev;
        }
        return [...prev, panelFile];
      });
      setActiveFileId(panelFile.id);
      return true;
    },
    [isMobile],
  );

  const isOpen = openFiles.length > 0 && !isMobile;

  const handleLayoutChanged = useCallback((layout: Record<string, number>) => {
    persistAdjacentPanelLayout(layout);
  }, []);

  return (
    <AdjacentAttachmentPanelContext
      value={{
        closeAllTabs,
        closeTab,
        isOpen,
        openAdjacentPreview,
        panelWidth: isOpen ? panelWidth : 0,
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden print:hidden">
        {isOpen && activeFileId ? (
          <ResizablePanelGroup
            className="min-h-0 min-w-0 flex-1"
            defaultLayout={defaultLayout}
            id="adjacent-attachment-panel-group"
            onLayoutChanged={handleLayoutChanged}
            orientation="horizontal"
          >
            <ResizablePanel
              className="min-w-0"
              id={MAIN_PANEL_ID}
              minSize="25%"
            >
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                {children}
              </div>
            </ResizablePanel>
            <ResizableHandle
              className="mx-0.5 w-1 rounded-full transition-colors"
              style={{ backgroundColor: "transparent" }}
              // withHandle
            />
            <ResizablePanel
              className="min-w-0"
              defaultSize={ADJACENT_PANEL_DEFAULT_WIDTH}
              id={ATTACHMENT_PANEL_ID}
              maxSize={ADJACENT_PANEL_MAX_WIDTH}
              minSize={ADJACENT_PANEL_MIN_WIDTH}
            >
              <AttachmentPanelSizer onWidthChange={handlePanelWidthChange}>
                <AttachmentSidePanel
                  activeFileId={activeFileId}
                  className="bg-page-card border-border/60 rounded-4xl border"
                  files={openFiles}
                  onClose={closeTab}
                  onCloseAll={closeAllTabs}
                  onSelectTab={setActiveFileId}
                />
              </AttachmentPanelSizer>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        )}
      </div>
    </AdjacentAttachmentPanelContext>
  );
}
