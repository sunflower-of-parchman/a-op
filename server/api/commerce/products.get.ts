import { loadPublishedCommerce } from '../../utils/commerce'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  return {
    stripeConfigured: Boolean(config.stripeSecretKey),
    simulationAvailable: Boolean(config.public.demoMode),
    products: await loadPublishedCommerce(event),
  }
})
