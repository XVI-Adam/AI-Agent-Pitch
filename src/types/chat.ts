export type Role = 'user' | 'assistant';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  /** True while tokens are still arriving from the stream */
  streaming?: boolean;
}

export interface ChatSession {
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
