import type { Alpine } from 'alpinejs'
// @ts-ignore types for x-collapse
import collapse from '@alpinejs/collapse'
 
export default (Alpine: Alpine) => {
    Alpine.plugin(collapse)
}