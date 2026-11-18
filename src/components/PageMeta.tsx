import { Helmet } from "react-helmet-async";

const SITE_URL = "https://epocarpc.com";
const DEFAULT_IMAGE = `${SITE_URL}/epocar-social.jpg`;

interface PageMetaProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  noIndex?: boolean;
}

export default function PageMeta({ title, description, path, image, noIndex = false }: PageMetaProps) {
  const url = `${SITE_URL}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex, follow" />}
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image ?? DEFAULT_IMAGE} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image ?? DEFAULT_IMAGE} />
    </Helmet>
  );
}
