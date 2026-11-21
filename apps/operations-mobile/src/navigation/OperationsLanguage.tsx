import { createContext, useContext, useState, type PropsWithChildren } from "react";

type OperationsLanguage = "en" | "my";
const OperationsLanguageContext = createContext<{ language: OperationsLanguage; setLanguage(language: OperationsLanguage): void }>({
  language: "en", setLanguage: () => undefined,
});

/** Presentation preference in this workspace session; never changes membership or installed tenant. */
export function OperationsLanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<OperationsLanguage>("en");
  return <OperationsLanguageContext.Provider value={{ language, setLanguage }}>{children}</OperationsLanguageContext.Provider>;
}

export function useOperationsLanguage() { return useContext(OperationsLanguageContext); }
export function useOperationsText() {
  const { language } = useOperationsLanguage();
  return (english: string, myanmar: string) => language === "my" ? myanmar : english;
}
