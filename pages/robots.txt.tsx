import type { GetServerSideProps } from 'next';
import { renderRobots, resolvePublicOrigin } from '@/lib/siteMetadata';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  try {
    const origin = resolvePublicOrigin(process.env.PUBLIC_SITE_URL, process.env.NODE_ENV === 'production');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.write(renderRobots(origin));
    res.end();
  } catch (error) {
    res.statusCode = 503;
    res.end(error instanceof Error ? error.message : 'Site metadata is unavailable');
  }
  return { props: {} };
};

export default function RobotsRoute() {
  return null;
}
