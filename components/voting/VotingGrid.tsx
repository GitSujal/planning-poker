import { VotingCard } from './VotingCard';
import { ParticipantRole } from '@/lib/types';

interface VotingGridProps {
  deck: string[];
  selectedValue?: string;
  role: ParticipantRole;
  votingStatus: string;
  onVote: (value: string) => void;
}

export function VotingGrid({ deck, selectedValue, role, votingStatus, onVote }: VotingGridProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3 sm:gap-4 max-w-3xl mx-auto">
      {deck.map(value => (
        <VotingCard
          key={value}
          value={value}
          selected={selectedValue === value}
          disabled={role === 'observer' || votingStatus !== 'open'}
          onVote={() => onVote(value)}
        />
      ))}
    </div>
  );
}
