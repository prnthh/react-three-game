import { withBasePath } from '../../basePath';
import ParkourDemo from './ParkourDemo';

export default function ParkourPage() {
    return <>
        <link rel="preload" as="fetch" crossOrigin="anonymous" href={withBasePath('/prefabs/parkour-course.json')} />
        <ParkourDemo />
    </>;
}
