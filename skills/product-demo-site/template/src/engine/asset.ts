/** A file under public/ (e.g. a captured shot), resolved against the site's base path. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
