export function useStarterMode(): boolean {
  const value: unknown = useRuntimeConfig().public.starterMode
  return import.meta.dev && (value === true || value === 'true')
}
