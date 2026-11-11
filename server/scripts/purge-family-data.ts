import 'dotenv/config';
import { requireDbTarget } from '../utils/require-db-target';
import { purgeExpiredFamilyData } from '../family/retention';
const apply = process.argv.includes('--apply');
requireDbTarget({ scriptName: 'family:retention', writes: apply });
purgeExpiredFamilyData(apply).then((result) => { console.log(result); process.exit(0); })
  .catch(() => { console.error('Family retention failed.'); process.exit(1); });
