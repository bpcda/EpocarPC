import { useQuery } from "@tanstack/react-query";
import {
  cmsEnabled, fetchFaqs, fetchHomepage, fetchNews, fetchNewsList, fetchPage, fetchPartners, fetchSiteSettings, fetchSponsors,
} from "@/lib/cms";

const opts = { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } as const;

export const useSiteSettings = () => useQuery({ queryKey: ["cms", "site"], queryFn: fetchSiteSettings, enabled: cmsEnabled(), ...opts });
export const useHomepage = () => useQuery({ queryKey: ["cms", "home"], queryFn: fetchHomepage, enabled: cmsEnabled(), ...opts });
export const useCmsPage = (slug: string) => useQuery({ queryKey: ["cms", "page", slug], queryFn: () => fetchPage(slug), enabled: cmsEnabled(), ...opts });
export const useNewsList = () => useQuery({ queryKey: ["cms", "news"], queryFn: () => fetchNewsList(), enabled: cmsEnabled(), ...opts });
export const useNews = (slug: string) => useQuery({ queryKey: ["cms", "news", slug], queryFn: () => fetchNews(slug), enabled: cmsEnabled(), ...opts });
export const useSponsors = () => useQuery({ queryKey: ["cms", "sponsors"], queryFn: fetchSponsors, enabled: cmsEnabled(), ...opts });
export const usePartners = () => useQuery({ queryKey: ["cms", "partners"], queryFn: fetchPartners, enabled: cmsEnabled(), ...opts });
export const useFaqs = () => useQuery({ queryKey: ["cms", "faqs"], queryFn: fetchFaqs, enabled: cmsEnabled(), ...opts });
