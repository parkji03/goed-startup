"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FounderQuizClient } from "@/components/quiz/founder-quiz-client";
import { ModalBody, ModalContent, ModalHeader, ModalTitle } from "@/components/ui/modal";

type QuizContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /**
   * A prompt that should be auto-sent into the AI chat as soon as it can
   * accept one. Set by the questionnaire's "Start chatting" completion
   * action; consumed (and cleared) by the chat panel.
   */
  pendingPrompt: string | null;
  setPendingPrompt: (text: string | null) => void;
};

const QuizContext = createContext<QuizContextValue | null>(null);

/**
 * Lifts the founder questionnaire modal to a level that any descendant can
 * open it: the resources page CTA, the AI guide's empty-state CTA, the
 * questionnaire's own completion screen, etc. Pair with `useQuiz()`.
 */
export function QuizProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Quiz.modal");
  const [isOpen, setIsOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<QuizContextValue>(
    () => ({ isOpen, open, close, pendingPrompt, setPendingPrompt }),
    [isOpen, open, close, pendingPrompt],
  );

  return (
    <QuizContext.Provider value={value}>
      {children}
      <ModalContent
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        size="2xl"
        aria-label={t("ariaLabel")}
      >
        <ModalHeader>
          <ModalTitle>{t("title")}</ModalTitle>
        </ModalHeader>
        <ModalBody className="pb-6">
          <FounderQuizClient onComplete={close} />
        </ModalBody>
      </ModalContent>
    </QuizContext.Provider>
  );
}

export function useQuiz(): QuizContextValue {
  const ctx = useContext(QuizContext);
  if (!ctx) {
    throw new Error("useQuiz must be used inside <QuizProvider>");
  }
  return ctx;
}
