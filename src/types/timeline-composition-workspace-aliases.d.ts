/**
 * App-owned type boundary for generated workspace-primitive registry imports.
 * Included by tsconfig.app.json through src; the source package stays pristine.
 *
 * The runtime resolves these specifiers to workspace or vendored source via
 * bundler aliases. Registry consumers depend only on the stable public
 * component contracts, not on the source workspace's private relative imports.
 */
type BanodocoWorkspaceEffectComponent =
  import('@banodoco/timeline-composition/theme-api').EffectComponent;
type BanodocoWorkspaceAnimationComponent =
  import('@banodoco/timeline-composition/theme-api').AnimationComponent;
type BanodocoWorkspaceTransitionComponent =
  import('@banodoco/timeline-composition/theme-api').TransitionComponent;

declare module '@workspace-effects/*' {
  const component: BanodocoWorkspaceEffectComponent;
  export default component;
}

declare module '@workspace-animations/*' {
  const component: BanodocoWorkspaceAnimationComponent;
  export default component;
}

declare module '@workspace-transitions/*' {
  const component: BanodocoWorkspaceTransitionComponent;
  export default component;
}
