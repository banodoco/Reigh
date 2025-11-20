import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChildGenerationsView } from '../components/VideoGallery/components/ChildGenerationsView';
import { useProject } from '@/shared/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Dedicated page for viewing and editing child segments of a parent generation
 */
const SegmentsPage: React.FC = () => {
    const { parentId } = useParams<{ parentId: string }>();
    const navigate = useNavigate();
    const { currentProject } = useProject();
    const [shotId, setShotId] = React.useState<string | null>(null);

    // Fetch parent generation's shot_id from shot_generations for back navigation
    useEffect(() => {
        if (!parentId) return;

        const fetchShotId = async () => {
            const { data, error } = await supabase
                .from('shot_generations')
                .select('shot_id')
                .eq('generation_id', parentId)
                .single();

            if (!error && data?.shot_id) {
                setShotId(data.shot_id);
            }
        };

        fetchShotId();
    }, [parentId]);

    const handleBack = () => {
        // Navigate back to the shot page if we have a shot_id, otherwise to the tool page
        if (shotId) {
            navigate(`/tools/travel-between-images#${shotId}`);
        } else {
            navigate('/tools/travel-between-images');
        }
    };

    if (!parentId) {
        // If no parentId, redirect back
        handleBack();
        return null;
    }

    return (
        <ChildGenerationsView
            parentGenerationId={parentId}
            projectId={currentProject?.id || null}
            onBack={handleBack}
        />
    );
};

export default SegmentsPage;
