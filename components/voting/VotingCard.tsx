import { cn } from "@/lib/utils";

interface VotingCardProps {
  value: string;
  selected: boolean;
  disabled: boolean;
  onVote: () => void;
}

export function VotingCard({ value, selected, disabled, onVote }: VotingCardProps) {
  return (
    <button
      onClick={onVote}
      disabled={disabled}
      className={cn(
        // Base styles - minimum 120px height for touch targets
        "relative aspect-[2/3] w-full min-h-[120px]",
        "rounded-xl font-bold text-2xl sm:text-3xl md:text-4xl",
        "transition-all duration-200 shadow-lg",
        "flex items-center justify-center",

        // Selected state
        selected && [
          "bg-primary text-primary-foreground",
          "-translate-y-2 ring-4 ring-primary/40",
          "shadow-xl shadow-primary/25"
        ],

        // Unselected state
        !selected && [
          "bg-card border-2 border-border",
          "hover:border-primary hover:-translate-y-1",
          "hover:shadow-xl"
        ],

        // Disabled state
        disabled && "opacity-40 cursor-not-allowed",

        // Touch feedback
        !disabled && "active:scale-95"
      )}
    >
      {value}
    </button>
  );
}
