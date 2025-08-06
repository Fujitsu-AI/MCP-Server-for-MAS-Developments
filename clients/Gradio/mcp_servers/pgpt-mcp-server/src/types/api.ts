export interface ChatArgs {
  question: string;
  usePublic?: boolean;
  groups?: string[];
  language?: string;
}

export interface ContinueChatArgs {
  chatId: string;
  question: string;
}

export interface GetChatArgs {
  chatId: string;
}

export interface SourceArgs {
  name: string;
  content: string;
  groups?: string[];
}

export interface EditSourceArgs {
  sourceId: string;
  name?: string;
  content?: string;
  groups?: string[];
}

export interface DeleteSourceArgs {
  sourceId: string;
}

export interface ListSourcesArgs {
  groupName: string;
}

export interface GetSourceArgs {
  sourceId: string;
}

export interface GroupArgs {
  groupName: string;
}

export interface CreateUserArgs {
  name: string;
  email: string;
  password: string;
  language?: string;
  timezone?: string;
  usePublic: boolean;
  groups: string[];
  roles: string[];
  activateFtp?: boolean;
  ftpPassword?: string;
}

export interface EditUserArgs {
  email: string;
  name?: string;
  password?: string;
  language?: string;
  timezone?: string;
  publicUpload?: boolean;
  groups?: string[];
  roles?: string[];
  activateFtp?: boolean;
  ftpPassword?: string;
}

export interface DeleteUserArgs {
  email: string;
}

export function validateChatArgs(args: Record<string, unknown> | undefined): ChatArgs {
  if (!args?.question || typeof args.question !== 'string') {
    throw new Error('Missing or invalid question');
  }

  return {
    question: args.question,
    usePublic: typeof args.usePublic === 'boolean' ? args.usePublic : false,
    groups: Array.isArray(args.groups) ? args.groups.map(String) : [],
    language: typeof args.language === 'string' ? args.language : 'en',
  };
}

export function validateSourceArgs(args: Record<string, unknown> | undefined): SourceArgs {
  if (!args?.name || typeof args.name !== 'string') {
    throw new Error('Missing or invalid name');
  }
  if (!args?.content || typeof args.content !== 'string') {
    throw new Error('Missing or invalid content');
  }

  return {
    name: args.name,
    content: args.content,
    groups: Array.isArray(args.groups) ? args.groups.map(String) : [],
  };
}

export function validateListSourcesArgs(args: Record<string, unknown> | undefined): ListSourcesArgs {
  if (!args?.groupName || typeof args.groupName !== 'string') {
    throw new Error('Missing or invalid groupName');
  }

  return {
    groupName: args.groupName,
  };
}

export function validateGetSourceArgs(args: Record<string, unknown> | undefined): GetSourceArgs {
  if (!args?.sourceId || typeof args.sourceId !== 'string') {
    throw new Error('Missing or invalid sourceId');
  }

  return {
    sourceId: args.sourceId,
  };
}

export function validateContinueChatArgs(args: Record<string, unknown> | undefined): ContinueChatArgs {
  if (!args?.chatId || typeof args.chatId !== 'string') {
    throw new Error('Missing or invalid chatId');
  }
  if (!args?.question || typeof args.question !== 'string') {
    throw new Error('Missing or invalid question');
  }

  return {
    chatId: args.chatId,
    question: args.question,
  };
}

export function validateGetChatArgs(args: Record<string, unknown> | undefined): GetChatArgs {
  if (!args?.chatId || typeof args.chatId !== 'string') {
    throw new Error('Missing or invalid chatId');
  }

  return {
    chatId: args.chatId,
  };
}

export function validateEditSourceArgs(args: Record<string, unknown> | undefined): EditSourceArgs {
  if (!args?.sourceId || typeof args.sourceId !== 'string') {
    throw new Error('Missing or invalid sourceId');
  }

  return {
    sourceId: args.sourceId,
    name: typeof args.name === 'string' ? args.name : undefined,
    content: typeof args.content === 'string' ? args.content : undefined,
    groups: Array.isArray(args.groups) ? args.groups.map(String) : undefined,
  };
}

export function validateDeleteSourceArgs(args: Record<string, unknown> | undefined): DeleteSourceArgs {
  if (!args?.sourceId || typeof args.sourceId !== 'string') {
    throw new Error('Missing or invalid sourceId');
  }

  return {
    sourceId: args.sourceId,
  };
}

export function validateGroupArgs(args: Record<string, unknown> | undefined): GroupArgs {
  if (!args?.groupName || typeof args.groupName !== 'string') {
    throw new Error('Missing or invalid groupName');
  }

  return {
    groupName: args.groupName,
  };
}

export function validateCreateUserArgs(args: Record<string, unknown> | undefined): CreateUserArgs {
  if (!args?.name || typeof args.name !== 'string') {
    throw new Error('Missing or invalid name');
  }
  if (!args?.email || typeof args.email !== 'string') {
    throw new Error('Missing or invalid email');
  }
  if (!args?.password || typeof args.password !== 'string') {
    throw new Error('Missing or invalid password');
  }
  if (typeof args.usePublic !== 'boolean') {
    throw new Error('Missing or invalid usePublic');
  }
  if (!Array.isArray(args.groups)) {
    throw new Error('Missing or invalid groups');
  }
  if (!Array.isArray(args.roles)) {
    throw new Error('Missing or invalid roles');
  }

  return {
    name: args.name,
    email: args.email,
    password: args.password,
    language: typeof args.language === 'string' ? args.language : undefined,
    timezone: typeof args.timezone === 'string' ? args.timezone : undefined,
    usePublic: args.usePublic,
    groups: args.groups.map(String),
    roles: args.roles.map(String),
    activateFtp: typeof args.activateFtp === 'boolean' ? args.activateFtp : undefined,
    ftpPassword: typeof args.ftpPassword === 'string' ? args.ftpPassword : undefined,
  };
}

export function validateEditUserArgs(args: Record<string, unknown> | undefined): EditUserArgs {
  if (!args?.email || typeof args.email !== 'string') {
    throw new Error('Missing or invalid email');
  }

  return {
    email: args.email,
    name: typeof args.name === 'string' ? args.name : undefined,
    password: typeof args.password === 'string' ? args.password : undefined,
    language: typeof args.language === 'string' ? args.language : undefined,
    timezone: typeof args.timezone === 'string' ? args.timezone : undefined,
    publicUpload: typeof args.publicUpload === 'boolean' ? args.publicUpload : undefined,
    groups: Array.isArray(args.groups) ? args.groups.map(String) : undefined,
    roles: Array.isArray(args.roles) ? args.roles.map(String) : undefined,
    activateFtp: typeof args.activateFtp === 'boolean' ? args.activateFtp : undefined,
    ftpPassword: typeof args.ftpPassword === 'string' ? args.ftpPassword : undefined,
  };
}

export function validateDeleteUserArgs(args: Record<string, unknown> | undefined): DeleteUserArgs {
  if (!args?.email || typeof args.email !== 'string') {
    throw new Error('Missing or invalid email');
  }

  return {
    email: args.email,
  };
}