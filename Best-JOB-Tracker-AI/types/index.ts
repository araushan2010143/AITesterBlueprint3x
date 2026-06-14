export type JobSearchStatus = 'active' | 'passive' | 'paused';

export type ApplicationStatus =
  | 'bookmarked'
  | 'applied'
  | 'phone_screen'
  | 'technical'
  | 'final_round'
  | 'offer'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn';

export type ApplicationSource =
  | 'linkedin'
  | 'naukri'
  | 'email'
  | 'referral'
  | 'manual'
  | 'extension';

export type RemoteType = 'remote' | 'hybrid' | 'onsite';

export type ApplicationPriority = 'urgent' | 'high' | 'medium' | 'low';

export type SalaryCurrency = 'INR' | 'USD' | 'GBP';

export type InterviewRoundType =
  | 'phone'
  | 'technical'
  | 'system_design'
  | 'hr'
  | 'culture_fit'
  | 'offer';

export type AIActionType =
  | 'resume_tailor'
  | 'cover_letter'
  | 'cold_email'
  | 'prep_questions'
  | 'match_score';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  target_role: string | null;
  target_companies: string[];
  job_search_status: JobSearchStatus;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  company: string;
  role_title: string;
  job_url: string | null;
  source: ApplicationSource;
  status: ApplicationStatus;
  applied_at: string | null;
  deadline: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: SalaryCurrency;
  location: string | null;
  remote_type: RemoteType;
  notes: string | null;
  ai_match_score: number | null;
  resume_version: string | null;
  cover_letter_url: string | null;
  priority: ApplicationPriority;
  created_at: string;
  updated_at: string;
}

export interface Interview {
  id: string;
  application_id: string;
  user_id: string;
  round_type: InterviewRoundType;
  scheduled_at: string | null;
  duration_minutes: number;
  interviewer_names: string[];
  platform: 'zoom' | 'meet' | 'teams' | 'phone' | 'onsite';
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  prep_notes: string | null;
  feedback_received: string | null;
  outcome: 'passed' | 'rejected' | 'pending' | null;
  created_at: string;
}

export interface AIUsage {
  id: string;
  user_id: string;
  action_type: AIActionType;
  date: string;
  count: number;
}

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'bookmarked',
  'applied',
  'phone_screen',
  'technical',
  'final_round',
  'offer',
  'rejected',
  'ghosted',
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  bookmarked: 'Bookmarked',
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  technical: 'Technical',
  final_round: 'Final Round',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
  withdrawn: 'Withdrawn',
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  bookmarked: 'bg-slate-500',
  applied: 'bg-blue-500',
  phone_screen: 'bg-yellow-500',
  technical: 'bg-orange-500',
  final_round: 'bg-purple-500',
  offer: 'bg-green-500',
  rejected: 'bg-red-500',
  ghosted: 'bg-gray-400',
  withdrawn: 'bg-gray-500',
};
