import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';

interface Project {
  id: string;
  name: string;
  created_at: string;
}

interface ProjectSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (projectId: string) => void;
  title?: string;
  description?: string;
}

/**
 * ProjectSelectorModal - Simple modal for selecting a project
 * 
 * Used for copying shared generations to a user's account
 * Allows selecting existing project or creating a new one
 */
export const ProjectSelectorModal: React.FC<ProjectSelectorModalProps> = ({
  open,
  onOpenChange,
  onSelect,
  title = "Select Project",
  description = "Choose which project to add this generation to"
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    if (open) {
      loadProjects();
    }
  }, [open]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ProjectSelectorModal] Failed to load projects:', error);
        return;
      }

      setProjects(data || []);
      
      // Auto-select first project
      if (data && data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (error) {
      console.error('[ProjectSelectorModal] Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      return;
    }

    setCreating(true);

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: newProjectName.trim()
        })
        .select('id, name, created_at')
        .single();

      if (error || !data) {
        console.error('[ProjectSelectorModal] Failed to create project:', error);
        return;
      }

      // Add to list and select
      setProjects(prev => [data, ...prev]);
      setSelectedProjectId(data.id);
      setShowNewProjectInput(false);
      setNewProjectName('');
    } catch (error) {
      console.error('[ProjectSelectorModal] Unexpected error:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = () => {
    if (selectedProjectId) {
      onSelect(selectedProjectId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : projects.length === 0 && !showNewProjectInput ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                You don't have any projects yet
              </p>
              <Button onClick={() => setShowNewProjectInput(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Project
              </Button>
            </div>
          ) : (
            <>
              {projects.length > 0 && !showNewProjectInput && (
                <div className="space-y-3">
                  <Label>Select a project:</Label>
                  <RadioGroup
                    value={selectedProjectId || ''}
                    onValueChange={setSelectedProjectId}
                    className="space-y-2"
                  >
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center space-x-2 rounded-md border p-3 hover:bg-accent cursor-pointer"
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <RadioGroupItem value={project.id} id={project.id} />
                        <Label
                          htmlFor={project.id}
                          className="flex-1 cursor-pointer"
                        >
                          {project.name}
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </RadioGroup>
                  
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowNewProjectInput(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Project
                  </Button>
                </div>
              )}

              {showNewProjectInput && (
                <div className="space-y-3">
                  <Label htmlFor="project-name">New Project Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="project-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Enter project name"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateProject();
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      onClick={handleCreateProject}
                      disabled={!newProjectName.trim() || creating}
                    >
                      {creating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Create'
                      )}
                    </Button>
                  </div>
                  {projects.length > 0 && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setShowNewProjectInput(false);
                        setNewProjectName('');
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedProjectId || loading}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

