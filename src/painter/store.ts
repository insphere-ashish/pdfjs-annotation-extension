import { PDFViewerApplication } from 'pdfjs'

import { IAnnotationStore } from '../const/definitions'
import { formatTimestamp } from '../utils/utils'

export class Store {
    // 所有注释
    private annotationStore: Map<string, IAnnotationStore> = new Map()
    // 原有注释
    private originalAnnotationStore: Map<string, IAnnotationStore> = new Map()
    // 变更跟踪
    private createdAnnotations: Set<string> = new Set() // 新创建的注释
    private modifiedAnnotations: Set<string> = new Set() // 修改的注释
    private deletedAnnotations: Set<string> = new Set() // 删除的注释
    // 页面加载跟踪
    private loadedPages: Set<number> = new Set() // 已加载注释的页面
    private pdfViewerApplication: PDFViewerApplication

    constructor({ PDFViewerApplication }: { PDFViewerApplication: PDFViewerApplication }) {
        this.pdfViewerApplication = PDFViewerApplication
    }

    /**
     * 获取指定 ID 的注释
     * @param id - 注释的 ID
     * @returns 注释对象，如果存在则返回，否则返回 undefined
     */
    get annotation() {
        return (id: string) => this.annotationStore.get(id)
    }

    get annotations() {
        return Array.from(this.annotationStore.values());
    }

    /**
     * 保存注释
     * @param store  
     * @param isOriginal  是否是原有注释
     */
    public save(store: IAnnotationStore, isOriginal: boolean) {
        this.annotationStore.set(store.id, store)
        if(isOriginal) {
            this.originalAnnotationStore.set(store.id, store)
        } else {
            // 新创建的注释
            this.createdAnnotations.add(store.id)
        }
        return store
    }

    /**
     * 更新指定 ID 的注释
     * @param id - 注释的 ID
     * @param updates - 更新的部分注释数据
     */
    public update(id: string, updates: Partial<IAnnotationStore>) {
        if (this.annotationStore.has(id)) {
            const existingAnnotation = this.annotationStore.get(id)
            if (existingAnnotation) {
                const updatedAnnotation = {
                    ...existingAnnotation,
                    ...updates,
                    date: formatTimestamp(Date.now())
                }
                this.annotationStore.set(id, updatedAnnotation)
                // 如果不是新创建的注释，标记为已修改
                if (!this.createdAnnotations.has(id)) {
                    this.modifiedAnnotations.add(id)
                }
                return updatedAnnotation
            }
        } else {
            console.warn(`Annotation with id ${id} not found.`)
            return null
        }
    }

    /**
     * 根据页面号获取注释
     * @param pageNumber - 页码
     * @returns 指定页面的注释列表
     */
    public getByPage(pageNumber: number): IAnnotationStore[] {
        return Array.from(this.annotationStore.values()).filter(annotation => annotation.pageNumber === pageNumber)
    }

    /**
     * 检查页面是否已加载注释
     * @param pageNumber - 页码
     * @returns 是否已加载
     */
    public isPageLoaded(pageNumber: number): boolean {
        return this.loadedPages.has(pageNumber)
    }

    /**
     * 标记页面为已加载
     * @param pageNumber - 页码
     */
    public markPageAsLoaded(pageNumber: number): void {
        this.loadedPages.add(pageNumber)
    }

    /**
     * 加载或更新页面的注释
     * @param pageNumber - 页码
     * @param annotations - 注释数组
     * @param isOriginal - 是否是原始注释
     */
    public loadPageAnnotations(pageNumber: number, annotations: IAnnotationStore[], isOriginal: boolean = true): void {
        // 如果页面已加载，先移除该页面的原有注释（不包括新创建的）
        if (this.loadedPages.has(pageNumber) && isOriginal) {
            const existingAnnotations = this.getByPage(pageNumber)
            existingAnnotations.forEach(annotation => {
                // 只移除原始注释，不移除新创建的
                if (this.originalAnnotationStore.has(annotation.id)) {
                    this.annotationStore.delete(annotation.id)
                    this.originalAnnotationStore.delete(annotation.id)
                }
            })
        }

        // 加载新注释
        annotations.forEach(annotation => {
            if (annotation.pageNumber === pageNumber) {
                this.save(annotation, isOriginal)
            }
        })

        // 标记页面为已加载
        this.loadedPages.add(pageNumber)
    }

    /**
     * 删除指定 ID 的注释
     * @param id - 要删除的注释的 ID
     */
    public delete(id: string): void {
        if (this.annotationStore.has(id)) {
            // 如果是原始注释，需要跟踪删除
            if (this.originalAnnotationStore.has(id)) {
                this.deletedAnnotations.add(id)
                console.log('[Store] Tracking deletion of original annotation:', id)
            } else {
                // 如果是新创建的注释，从创建列表中移除
                this.createdAnnotations.delete(id)
                console.log('[Store] Removing newly created annotation (not yet saved):', id)
            }
            // 从修改列表中移除（如果存在）
            this.modifiedAnnotations.delete(id)
            this.annotationStore.delete(id)
        } else {
            console.warn(`Annotation with id ${id} not found.`)
        }
    }

    /**
     * 获取所有变更的注释（创建、修改、删除）
     * @returns 包含变更注释的数组
     */
    public getChangedAnnotations(): any[] {
        const changes: any[] = []

        // 新创建的注释 - skip shared comments (sharedToUser=true)
        this.createdAnnotations.forEach(id => {
            const annotation = this.annotationStore.get(id)
            if (annotation && !annotation.sharedToUser) {
                changes.push({
                    ...annotation,
                    _changeType: 'created'
                })
            }
        })

        // 修改的注释 - skip shared comments (sharedToUser=true)
        this.modifiedAnnotations.forEach(id => {
            const annotation = this.annotationStore.get(id)
            if (annotation && !annotation.sharedToUser) {
                changes.push({
                    ...annotation,
                    _changeType: 'modified'
                })
            }
        })

        // 删除的注释 - skip shared comments (sharedToUser=true)
        this.deletedAnnotations.forEach(id => {
            const originalAnnotation = this.originalAnnotationStore.get(id)
            if (originalAnnotation && !originalAnnotation.sharedToUser) {
                changes.push({
                    id: originalAnnotation.id,
                    pageNumber: originalAnnotation.pageNumber,
                    is_deleted: true,
                    _changeType: 'deleted'
                })
                console.log('[Store] Including deleted annotation in changes:', {
                    id: originalAnnotation.id,
                    pageNumber: originalAnnotation.pageNumber,
                    is_deleted: true
                })
            }
        })

        console.log('[Store] Total changes:', {
            created: this.createdAnnotations.size,
            modified: this.modifiedAnnotations.size,
            deleted: this.deletedAnnotations.size,
            total: changes.length
        })

        return changes
    }

    /**
     * 清除所有变更跟踪
     */
    public clearChangeTracking(): void {
        // 将已保存的创建注释移到原始存储，以便将来可以跟踪删除
        this.createdAnnotations.forEach(id => {
            const annotation = this.annotationStore.get(id)
            if (annotation) {
                this.originalAnnotationStore.set(id, annotation)
                console.log('[Store] Moving saved created annotation to original store:', id)
            }
        })
        
        this.createdAnnotations.clear()
        this.modifiedAnnotations.clear()
        this.deletedAnnotations.clear()
    }

    /**
     * 检查是否有未保存的变更
     */
    public hasChanges(): boolean {
        return this.createdAnnotations.size > 0 || 
               this.modifiedAnnotations.size > 0 || 
               this.deletedAnnotations.size > 0
    }

    /**
     * 清除所有页面加载跟踪
     */
    public clearLoadedPages(): void {
        this.loadedPages.clear()
    }

}
