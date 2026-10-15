import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';
import {
  TimelineSchemaIncompatibleError,
  type TimelineSchemaIssue,
} from '@/sdk/video/timeline/errors.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

/**
 * Validate only the existing Astrid format header and carrier envelope.
 * Carrier entries remain opaque to the App and are copied without rewriting.
 */
export const getAstridConfigCompatibilityIssues = (value: unknown): TimelineSchemaIssue[] => {
  if (!isRecord(value) || !isRecord(value.app) || !Object.hasOwn(value.app, 'astrid')) {
    return [];
  }

  const astrid = value.app.astrid;
  if (!isRecord(astrid)) {
    return [{
      pointer: '/app/astrid',
      code: 'astrid_namespace_malformed',
      message: 'app.astrid must be an object.',
    }];
  }

  const version = Object.hasOwn(astrid, 'v') ? astrid.v : 0;
  if (typeof version !== 'number' || !Number.isInteger(version) || ![0, 1, 2].includes(version)) {
    return [{
      pointer: '/app/astrid/v',
      code: 'astrid_format_version_unsupported',
      message: `Unsupported app.astrid.v=${String(version)}; supported values are 0, 1, and 2.`,
    }];
  }

  const hasMusicBeds = Object.hasOwn(astrid, 'music_beds');
  if (version === 2 && !hasMusicBeds) {
    return [{
      pointer: '/app/astrid/music_beds',
      code: 'astrid_music_beds_version_mismatch',
      message: 'app.astrid.v=2 requires the music_beds carrier.',
    }];
  }
  if (version !== 2 && hasMusicBeds) {
    return [{
      pointer: '/app/astrid/music_beds',
      code: 'astrid_music_beds_version_mismatch',
      message: 'The music_beds carrier requires app.astrid.v=2.',
    }];
  }
  if (hasMusicBeds && !isRecord(astrid.music_beds)) {
    return [{
      pointer: '/app/astrid/music_beds',
      code: 'astrid_music_beds_malformed',
      message: 'app.astrid.music_beds must be an object keyed by scoped owner.',
    }];
  }

  return [];
};

export const assertSupportedAstridConfig = (value: unknown): void => {
  const issues = getAstridConfigCompatibilityIssues(value);
  if (issues.length > 0) {
    throw new TimelineSchemaIncompatibleError(
      issues.map((issue) => issue.message ?? 'Astrid timeline format is incompatible').join('; '),
      issues,
    );
  }
};

export const assertSupportedAstridTimelineConfig = (config: TimelineConfig): void => {
  assertSupportedAstridConfig(config);
};
