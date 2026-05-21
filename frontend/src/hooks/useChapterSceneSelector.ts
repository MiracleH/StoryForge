import { useState, useEffect } from 'react';
import { useStoryboardStore } from '../stores';

export function useChapterSceneSelector(projectId: number | null) {
  const { chapters, scenes, fetchChapters, fetchScenes } = useStoryboardStore();
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    fetchChapters(projectId);
    setSelectedChapterId(null);
    setSelectedSceneId(null);
  }, [projectId]);

  useEffect(() => {
    if (!selectedChapterId) return;
    fetchScenes(selectedChapterId);
    setSelectedSceneId(null);
  }, [selectedChapterId]);

  const chapterScenes = chapters.find(c => c.id === selectedChapterId)?.scenes || [];

  return {
    chapters,
    scenes,
    chapterScenes,
    selectedChapterId,
    setSelectedChapterId,
    selectedSceneId,
    setSelectedSceneId,
  };
}
