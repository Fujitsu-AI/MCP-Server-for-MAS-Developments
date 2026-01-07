export interface ChatArgs {
  question: string;
  usePublic?: boolean;
  groups?: string[];
  language?: string;
}

export interface SourceArgs {
  name: string;
  content: string;
  groups?: string[];
}

export interface ListSourcesArgs {
  groupName: string;
}

export interface GetSourceArgs {
  sourceId: string;
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
