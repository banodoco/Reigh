import { Link } from 'react-router-dom';
import { AppEnv, LOCAL_ENVS, type AppEnvValue } from '../types/env';

interface Tool {
  name: string;
  path: string;
  description: string;
  environments: AppEnvValue[];
}

const tools: Tool[] = [
  {
    name: 'Generate Images with Structure',
    path: '/tools/image-generation',
    description: 'Craft and generate intricate images using a structured approach.',
    environments: [AppEnv.DEV],
  },
  {
    name: 'Travel Between Images',
    path: '/tools/video-travel',
    description: 'Create video sequences by defining paths between existing images.',
    environments: LOCAL_ENVS,
  },
  {
    name: 'Edit Travel (Image Edit)',
    path: '/tools/edit-travel',
    description: 'Edit an existing image using text prompts with the Fal Kontext model.',
    environments: [AppEnv.DEV],
  },
  // Placeholder examples if you add more tools:
  // { name: 'Placeholder Tool 1', path: '#', description: 'Future tool placeholder.', environments: [AppEnv.DEV, AppEnv.WEB] }, // DEV and WEB
  // { name: 'Placeholder Tool 2', path: '#', description: 'Another future tool placeholder.', environments: [AppEnv.LOCAL, AppEnv.WEB] }, // LOCAL and WEB
];

export default function ToolSelectorPage() {
  const currentEnv = (import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.DEV) as AppEnvValue;

  const visibleTools = tools.filter(tool => {
    if (currentEnv === AppEnv.DEV) {
      return true; // Show all tools if current environment is DEV
    }
    // For other environments (local, web), respect the tool's specific environments array
    return tool.environments.includes(currentEnv);
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-center mb-12">Select a Tool</h1>
      {visibleTools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {visibleTools.map((tool) => (
            <Link
              to={tool.path}
              key={tool.name}
              className="block p-6 bg-card text-card-foreground rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 ease-in-out transform hover:-translate-y-1"
            >
              <h2 className="text-2xl font-semibold mb-3">{tool.name}</h2>
              <p className="text-muted-foreground">{tool.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <p className="text-xl text-muted-foreground">
            {currentEnv === AppEnv.DEV && tools.length > 0 ? 
              'No tools are configured to be visible in the DEV environment. Check tool definitions in ToolSelectorPage.tsx' :
              `No tools available for the current environment (${currentEnv}).`
            }
          </p>
          {/* Provide a more helpful message if currentEnv is not DEV and no tools are showing */}
          {currentEnv !== AppEnv.DEV && !tools.some(t => t.environments.includes(currentEnv)) && (
             <p className="text-sm text-muted-foreground mt-2">You might want to check the `environments` array for each tool in `ToolSelectorPage.tsx` or set VITE_APP_ENV to `dev` to see all development tools.</p>
          )}
           {/* Message if dev env itself has no tools configured to show */}
          {currentEnv === AppEnv.DEV && !tools.some(t => t.environments.includes(AppEnv.DEV)) && tools.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">Ensure tools intended for development have `AppEnv.DEV` in their `environments` array in `ToolSelectorPage.tsx`.</p>
          )}

        </div>
      )}
    </div>
  );
} 