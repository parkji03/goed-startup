"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  MapPersona,
  MapQuizAnswers,
  MapRecommendCandidate,
} from "@/lib/map-recommend/prompt";
import { MapQuizClient } from "@/components/map/map-quiz-client";
import {
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";

/**
 * Payload posted from the questionnaire modal to the chat sidebar's
 * recommendation flow. Identity-changing each submit so the chat panel
 * can use a `useEffect` keyed on `submissionId` to fire exactly once per
 * questionnaire run.
 */
export type PendingMapQuiz = {
  submissionId: string;
  persona: MapPersona;
  answers: MapQuizAnswers;
  candidates: MapRecommendCandidate[];
};

/**
 * Kind embedded in chat-link hrefs (`#entity-<kind>-<id>`). Map page
 * uses it to pick the right Convex table when a click resolves to an
 * entity that isn't currently in the filtered map subscription.
 */
export type EntityLinkKind = 'company' | 'investor';

type EntitySelectHandler = (entityId: string, kind: EntityLinkKind) => void;

type MapQuizContextValue = {
  /** Open/close the questionnaire modal. */
  isOpen: boolean;
  open: () => void;
  close: () => void;

  /** Submitted-but-not-yet-consumed quiz payload. The chat sidebar's
   * recommendations panel reads this, kicks off the API call, and clears
   * it via `consumePendingQuiz`. Null between submissions. */
  pendingQuiz: PendingMapQuiz | null;
  submitQuiz: (payload: Omit<PendingMapQuiz, "submissionId">) => void;
  /** Clears the pending payload after the consumer has dispatched a
   * request for it. Idempotent — calling on already-null state is a no-op. */
  consumePendingQuiz: () => void;

  /** Map page registers this so chat-link clicks can pan/select markers.
   * Stored as a ref under the hood so the map page can re-register on
   * each render without forcing the chat panel to re-subscribe. */
  registerEntitySelect: (handler: EntitySelectHandler | null) => void;
  selectEntity: EntitySelectHandler;
};

const MapQuizContext = createContext<MapQuizContextValue | null>(null);

/**
 * Lifts the map questionnaire modal + the cross-sidebar recommendation
 * channel high enough that both the map page (publishes the entity-select
 * callback, opens the modal from the FilterBar) and the AI chat sidebar
 * (consumes the pending payload, dispatches entity-select on link clicks)
 * can share state via `useMapQuiz()`.
 *
 * Mounted alongside `QuizProvider` in `PublicSiteShell`.
 */
export function MapQuizProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingQuiz, setPendingQuiz] = useState<PendingMapQuiz | null>(null);

  // Stored as a ref because the chat panel keeps a stable callback
  // (`selectEntity` below) that should always dispatch to the *latest*
  // registered handler. Re-rendering through React state would re-create
  // `selectEntity` on every map-page re-render and force the chat panel
  // to invalidate any memoization keyed on it.
  const handlerRef = useRef<EntitySelectHandler | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const submitQuiz = useCallback(
    (payload: Omit<PendingMapQuiz, "submissionId">) => {
      const submissionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setPendingQuiz({ ...payload, submissionId });
      setIsOpen(false);
    },
    [],
  );

  const consumePendingQuiz = useCallback(() => {
    setPendingQuiz(null);
  }, []);

  const registerEntitySelect = useCallback(
    (handler: EntitySelectHandler | null) => {
      handlerRef.current = handler;
    },
    [],
  );

  const selectEntity = useCallback<EntitySelectHandler>((entityId, kind) => {
    handlerRef.current?.(entityId, kind);
  }, []);

  const value = useMemo<MapQuizContextValue>(
    () => ({
      isOpen,
      open,
      close,
      pendingQuiz,
      submitQuiz,
      consumePendingQuiz,
      registerEntitySelect,
      selectEntity,
    }),
    [
      isOpen,
      open,
      close,
      pendingQuiz,
      submitQuiz,
      consumePendingQuiz,
      registerEntitySelect,
      selectEntity,
    ],
  );

  return (
    <MapQuizContext.Provider value={value}>
      {children}
      <ModalContent
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        size="2xl"
        aria-label="Map questionnaire"
      >
        <ModalHeader>
          <ModalTitle>Find your match on the map</ModalTitle>
        </ModalHeader>
        <ModalBody className="pb-6">
          <MapQuizClient onClose={close} />
        </ModalBody>
      </ModalContent>
    </MapQuizContext.Provider>
  );
}

export function useMapQuiz(): MapQuizContextValue {
  const ctx = useContext(MapQuizContext);
  if (!ctx) {
    throw new Error("useMapQuiz must be used inside <MapQuizProvider>");
  }
  return ctx;
}
