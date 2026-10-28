import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { createMockModel } from './mock/mock-model';
import { mockJudgeResponder, mockSubjectResponder } from './mock/responders';

/**
 * EVAL_MODE controls which models the harness talks to.
 *  - mock (default): deterministic in-process model; no keys, safe for CI.
 *  - live: real providers, chosen by EVAL_PROVIDER (anthropic | openai).
 */
export type EvalMode = 'mock' | 'live';
export type ModelRole = 'subject' | 'judge';

export function getEvalMode(): EvalMode {
  return process.env.EVAL_MODE === 'live' ? 'live' : 'mock';
}

const DEFAULTS = {
  anthropic: { subject: 'claude-haiku-4-5', judge: 'claude-sonnet-4-5' },
  openai: { subject: 'gpt-4.1-mini', judge: 'gpt-4.1' },
} as const;

type Provider = keyof typeof DEFAULTS;

function providerFor(role: ModelRole): Provider {
  // The judge can come from a different provider family than the subject, which
  // reduces self-preference bias (a model grading its own family's outputs).
  const raw = (role === 'judge' && process.env.EVAL_JUDGE_PROVIDER) || process.env.EVAL_PROVIDER;
  return raw === 'openai' ? 'openai' : 'anthropic';
}

export function getModel(role: ModelRole): LanguageModel {
  if (getEvalMode() === 'mock') {
    return role === 'judge'
      ? createMockModel('mock-judge', mockJudgeResponder)
      : createMockModel('mock-subject', mockSubjectResponder);
  }

  const provider = providerFor(role);
  const envKey = role === 'judge' ? 'EVAL_JUDGE_MODEL' : 'EVAL_SUBJECT_MODEL';
  // `||`, not `??`: CI passes unset repository variables through as empty strings.
  const modelId = process.env[envKey]?.trim() || DEFAULTS[provider][role];

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for EVAL_MODE=live with openai');
    return openai(modelId);
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required for EVAL_MODE=live with anthropic');
  return anthropic(modelId);
}

export function describeModel(model: LanguageModel): string {
  return typeof model === 'string' ? model : `${model.provider}:${model.modelId}`;
}
