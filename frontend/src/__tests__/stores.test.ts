import { describe, it, expect, beforeEach } from 'vitest';
import { useAIStore } from '../stores/ai';

describe('useAIStore', () => {
  beforeEach(() => {
    useAIStore.setState({
      config: null,
      generating: {},
    });
  });

  it('should have initial state', () => {
    const state = useAIStore.getState();
    expect(state.config).toBeNull();
    expect(state.generating).toEqual({});
  });

  it('should set generating state', () => {
    const { setGenerating } = useAIStore.getState();
    setGenerating('character-1', true);
    expect(useAIStore.getState().generating['character-1']).toBe(true);

    setGenerating('character-1', false);
    expect(useAIStore.getState().generating['character-1']).toBe(false);
  });

  it('should set multiple generating states', () => {
    const { setGenerating } = useAIStore.getState();
    setGenerating('character-1', true);
    setGenerating('scene-2', true);

    const state = useAIStore.getState();
    expect(state.generating['character-1']).toBe(true);
    expect(state.generating['scene-2']).toBe(true);
  });

  it('should not affect other generating keys when setting one', () => {
    const { setGenerating } = useAIStore.getState();
    setGenerating('character-1', true);
    setGenerating('scene-2', false);

    expect(useAIStore.getState().generating['character-1']).toBe(true);
    expect(useAIStore.getState().generating['scene-2']).toBe(false);
  });
});
