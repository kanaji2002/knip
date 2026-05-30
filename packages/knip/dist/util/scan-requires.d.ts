type IssueRef = {
    filePath: string;
    symbol: string;
};
export declare function getSourceReferencedPackages(issues: IssueRef[], analyzedFiles: Set<string>): Promise<(issue: IssueRef) => boolean>;
export {};
