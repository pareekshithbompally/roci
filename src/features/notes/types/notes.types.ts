export interface Note {
  id: string;
  text: string;
  timestamp: number;
  meetingId?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export interface NoteInput {
  text: string;
  meetingId: string;
}
