import bootstrapArtistConfig from './content/demo/bootstrap-config.json'
import { artistConfigSchema } from './shared/schemas/artistConfig'

export const artistConfig = artistConfigSchema.parse(bootstrapArtistConfig)

export default artistConfig
