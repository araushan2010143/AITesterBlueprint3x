import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { OnboardingBanner } from '@/components/layout/OnboardingBanner';

export default function TrackerPage() {
  return (
    <>
      <OnboardingBanner />
      <KanbanBoard />
    </>
  );
}
