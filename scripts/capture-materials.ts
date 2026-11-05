import { captureMaterials } from '../server/capture.ts';
import { getProject } from '../server/projects.ts';
const project = await getProject(process.argv[2] ?? '');
if (!project) throw new Error('项目不存在');
console.log(JSON.stringify(await captureMaterials(project), null, 2));
