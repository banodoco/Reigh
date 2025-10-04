import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom';
import ToolSelectorPage from '@/pages/ToolSelectorPage';
import HomePage from '@/pages/HomePage';
import ArtPage from '@/pages/ArtPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import PaymentCancelPage from '@/pages/PaymentCancelPage';

// Import ImageGenerationToolPage directly to prevent lazy loading issues with TanStack Query
import ImageGenerationToolPage from '@/tools/image-generation/pages/ImageGenerationToolPage';
// Import VideoTravelToolPage eagerly to avoid dynamic import issues on some mobile browsers (e.g. Safari)
import VideoTravelToolPage from '@/tools/travel-between-images/pages/VideoTravelToolPage';
// Import CharacterAnimatePage eagerly for consistency with other main tools
import CharacterAnimatePage from '@/tools/character-animate/pages/CharacterAnimatePage';
// Keep other heavy tools lazy-loaded to preserve bundle size
const EditTravelToolPage = lazy(() => import('@/tools/edit-travel/pages/EditTravelToolPage'));
const TrainingDataHelperPage = lazy(() => import('@/tools/training-data-helper/pages/TrainingDataHelperPage'));
import NotFoundPage from '@/pages/NotFoundPage'; // Assuming NotFoundPage will be moved here or created
import { LastAffectedShotProvider } from '@/shared/contexts/LastAffectedShotContext';
import ShotsPage from "@/pages/ShotsPage";
import GenerationsPage from "@/pages/GenerationsPage"; // Import the new GenerationsPage
import Layout from './Layout'; // Import the new Layout component
import { AppEnv } from '@/types/env';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { supabase } from '@/integrations/supabase/client';

// Determine the environment
const currentEnv = (import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB);

// Loading fallback component for lazy loaded pages
const LazyLoadingFallback = () => (
  <ReighLoading />
);

const router = createBrowserRouter([
  // HomePage route without Layout (no header) when in web environment
  ...(currentEnv === AppEnv.WEB ? [{
    path: '/',
    loader: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        return redirect('/tools');
      }
      return null;
    },
    element: <HomePage />,
    errorElement: <NotFoundPage />,
  }] : []),
  
  // Add /home route that also leads to HomePage
  {
    path: '/home',
    element: <HomePage />,
    errorElement: <NotFoundPage />,
  },
  
  // Payment pages (outside of Layout to avoid auth requirements)
  {
    path: '/payments/success',
    element: <PaymentSuccessPage />,
    errorElement: <NotFoundPage />,
  },
  {
    path: '/payments/cancel',
    element: <PaymentCancelPage />,
    errorElement: <NotFoundPage />,
  },

  
  {
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      // ToolSelectorPage at root for non-web environments
      ...(currentEnv !== AppEnv.WEB ? [{
        path: '/',
        element: <ToolSelectorPage />,
      }] : []),
      {
        path: '/tools',
        element: <ToolSelectorPage />,
      },
      {
        path: '/tools/image-generation',
        element: <ImageGenerationToolPage />,
        // Add a stable key to prevent remounting on route revisits
        loader: () => null,
      },
      {
        path: '/tools/travel-between-images',
        element: <VideoTravelToolPage />, // No Suspense wrapper needed – component is loaded synchronously
      },
      {
        path: '/tools/character-animate',
        element: <CharacterAnimatePage />, // No Suspense wrapper needed – component is loaded synchronously
      },
      {
        path: '/tools/edit-travel',
        element: (
          <Suspense fallback={<LazyLoadingFallback />}>
            <EditTravelToolPage />
          </Suspense>
        ),
      },
      {
        path: '/tools/training-data-helper',
        element: (
          <Suspense fallback={<LazyLoadingFallback />}>
            <TrainingDataHelperPage />
          </Suspense>
        ),
      },
      {
        path: '/shots',
        element: <ShotsPage />,
      },
      {
        path: '/generations',
        element: <GenerationsPage />,
      },
      {
        path: '/art',
        element: <ArtPage />,
      },
      // Any other top-level page routes can become children here
    ]
  },
  // If you have routes that shouldn't use the Layout, they can remain outside
  // For example, a dedicated login page or a full-screen error page.
  // However, for most standard pages, they will be children of the Layout route.
  // The root NotFoundPage is handled by errorElement on the Layout route.
  // If you need a catch-all * route, it can be added as a child of Layout as well.
  {
    path: '*',
    element: <NotFoundPage /> // This can be a child of Layout or a separate top-level route
                            // If child of Layout: { path: '*', element: <NotFoundPage /> }
                            // If you want NotFoundPage to also have the Layout, put it in children array.
                            // For a non-layout 404, keep it separate or rely on the errorElement.
  }
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
} 