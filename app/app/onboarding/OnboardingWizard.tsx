"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StepA } from "@/components/onboarding/StepA";
import { StepB } from "@/components/onboarding/StepB";
import { StepC } from "@/components/onboarding/StepC";
import { StepD } from "@/components/onboarding/StepD";
import { StepE } from "@/components/onboarding/StepE";
import { completeOnboardingAction } from "@/lib/onboarding/actions";
import type { OnboardingStep } from "@/lib/onboarding/state";

const STEPS: { key: OnboardingStep; title: string; description: string }[] = [
  {
    key: "a",
    title: "Tell us about yourself",
    description: "Your name and timezone help us send check-in reminders at the right time.",
  },
  {
    key: "b",
    title: "Secure your vault",
    description: "Create a passphrase that encrypts everything in your vault. Only you will ever know it.",
  },
  {
    key: "c",
    title: "Set your heartbeat",
    description: "How often do you want to check in? We'll send reminders so you never miss one.",
  },
  {
    key: "d",
    title: "Choose your keepers",
    description: "Two trusted people who will confirm your passing and receive your legacy.",
  },
  {
    key: "e",
    title: "Write your first letter",
    description: "Leave a message that will only be read when you're truly gone.",
  },
];

interface OnboardingWizardProps {
  initialStep: OnboardingStep;
  initialDisplayName: string;
  initialTimezone: string;
}

export function OnboardingWizard({
  initialStep,
  initialDisplayName,
  initialTimezone,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    initialStep === "done" ? "a" : initialStep
  );

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const stepMeta = STEPS[stepIndex];

  async function handleComplete() {
    const result = await completeOnboardingAction();
    if (!result?.error) {
      // completeOnboardingAction redirects to /app — this is a fallback.
      router.push("/app");
    }
  }

  function advanceStep() {
    const next = STEPS[stepIndex + 1];
    if (next) {
      setCurrentStep(next.key);
    } else {
      void handleComplete();
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* Progress indicator */}
      <div className="mb-6 flex gap-2" aria-label="Onboarding progress">
        {STEPS.map((step, i) => (
          <div
            key={step.key}
            aria-current={step.key === currentStep ? "step" : undefined}
            className={`h-1.5 w-8 rounded-full transition-colors ${
              i < stepIndex
                ? "bg-primary"
                : i === stepIndex
                ? "bg-primary/70"
                : "bg-muted"
            }`}
          />
        ))}
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs tracking-[0.3em] text-primary/80 uppercase">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
          <CardTitle className="font-serif text-xl">{stepMeta?.title}</CardTitle>
          <CardDescription>{stepMeta?.description}</CardDescription>
        </CardHeader>

        <CardContent>
          {currentStep === "a" && (
            <StepA
              initialDisplayName={initialDisplayName}
              initialTimezone={initialTimezone}
              onComplete={advanceStep}
            />
          )}
          {currentStep === "b" && (
            <StepB
              onComplete={advanceStep}
              onSkip={advanceStep}
            />
          )}
          {currentStep === "c" && (
            <StepC onComplete={advanceStep} />
          )}
          {currentStep === "d" && (
            <StepD
              onSkip={advanceStep}
              onComplete={() => void handleComplete()}
            />
          )}
          {currentStep === "e" && (
            <StepE
              onSkip={() => void handleComplete()}
              onComplete={() => void handleComplete()}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
