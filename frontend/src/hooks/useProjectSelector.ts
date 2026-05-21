import { useState, useEffect } from 'react';
import { useProjectStore } from '../stores';

export function useProjectSelector(autoSelect = false) {
  const { projects, fetchProjects } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  useEffect(() => { fetchProjects({ limit: 100 }); }, []);
  useEffect(() => {
    if (autoSelect && !selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, autoSelect]);

  return { projects, selectedProjectId, setSelectedProjectId };
}
