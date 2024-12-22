import type { DependencyContainer } from "tsyringe";
import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import type { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";

import cases from "../config/config.json";

const THERAPIST_ID = "54cb57776803fa99248b456e";
const ROUBLES_ID = "5449016a4bdc2d6f028b456f";

class Mod implements IPostDBLoadMod {
    private static readonly CASE_ID_MAP = {
        CollectorCase: "7f2ad48631e4c08eb3a8597d"
    };

    private readonly modName = "CollectorCase";
    private container: DependencyContainer;
    private logger: ILogger;

    public postDBLoad(container: DependencyContainer): void {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.log(`[${this.modName}] : Mod loading`, LogTextColor.GREEN);

        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();
        
        Object.values(cases).forEach(caseConfig => {
            // Skip if trader is not Therapist
            if (caseConfig.trader !== "therapist") return;
            this.createCase(caseConfig, tables);
        });
    }

    private createCase(caseConfig: any, tables: any): void {
        const templateId = Mod.CASE_ID_MAP[caseConfig.id];
        if (!templateId) return;

        const item = this.createBaseItem(caseConfig, tables.templates.items);
        item._id = templateId;
        item._props.Prefab.path = "CollectorCase/case.bundle";

        if (caseConfig.case_type === "slots") {
            item._props.Slots = this.createSlots(caseConfig.slot_ids);
        }

        // Update item properties
        Object.assign(item._props, {
            Width: caseConfig.ExternalSize.width,
            Height: caseConfig.ExternalSize.height,
            CanSellOnRagfair: !caseConfig.flea_banned,
            InsuranceDisabled: !caseConfig.insurance_enabled
        });

        // Update tables
        tables.templates.items[templateId] = item;
        this.updateLocales(templateId, caseConfig, tables.locales.global);
        this.updateHandbook(templateId, caseConfig.flea_price, tables.templates.handbook);
        this.updateContainerPermissions(templateId, caseConfig, tables.templates.items);
        this.addToTrader(templateId, caseConfig, tables.traders[THERAPIST_ID]);
    }

    private createBaseItem(config: any, items: any): any {
        if (config.case_type === "slots") {
            const baseItem = structuredClone(items["5a9d6d00a2750c5c985b5305"]);
            baseItem._props.IsAlwaysAvailableForInsurance = true;
            baseItem._props.DiscardLimit = -1;
            baseItem._props.ItemSound = config.sound;
            return baseItem;
        }
        return {};
    }

    private createSlots(slotIds: string[]): any[] {
        return slotIds.map((slotId, index) => ({
            _name: `mod_mount_${index}`,
            _id: this.container.resolve<any>("HashUtil").generate(),
            _parent: Mod.CASE_ID_MAP.Collectors_Case,
            _props: {
                filters: [{
                    Filter: [slotId],
                    ExcludedFilter: []
                }],
                _required: false,
                _mergeSlotWithChildren: false
            }
        }));
    }

    private updateLocales(templateId: string, config: any, locales: Record<string, Record<string, string>>): void {
        Object.values(locales).forEach(locale => {
            locale[`${templateId} Name`] = config.item_name;
            locale[`${templateId} ShortName`] = config.item_short_name;
            locale[`${templateId} Description`] = config.item_description;
        });
    }

    private updateHandbook(templateId: string, price: number, handbook: any): void {
        handbook.Items.push({
            Id: templateId,
            ParentId: "5b5f6fa186f77409407a7eb7",
            Price: price
        });
    }

    private updateContainerPermissions(
        itemId: string, 
        config: any, 
        items: Record<string, ITemplateItem>
    ): void {
        Object.values(items).forEach(item => {
            if (item._type !== "Item") return;

            if (config.allow_in_secure_containers && item._parent === BaseClasses.MOB_CONTAINER) {
                this.updateFilters(item, itemId, true);
            }

            if (config.case_allowed_in?.includes(item._id)) {
                this.updateFilters(item, itemId, true);
            }
        });
    }

    private updateFilters(item: ITemplateItem, itemId: string, isInclude: boolean): void {
        if (!item._props.Grids) return;
        
        item._props.Grids.forEach(grid => {
            const filterArray = isInclude ? 'Filter' : 'ExcludedFilter';
            if (!grid._props.filters[0]) {
                grid._props.filters[0] = { Filter: [], ExcludedFilter: [] };
            }
            if (!grid._props.filters[0][filterArray]) {
                grid._props.filters[0][filterArray] = [];
            }
            if (!grid._props.filters[0][filterArray].includes(itemId)) {
                grid._props.filters[0][filterArray].push(itemId);
            }
        });
    }

    private addToTrader(templateId: string, config: any, trader: any): void {
        if (!trader) {
            this.logger.error(`[${this.modName}] : Could not find Therapist trader`);
            return;
        }

        trader.assort.items.push({
            _id: templateId,
            _tpl: templateId,
            parentId: "hideout",
            slotId: "hideout",
            upd: {
                UnlimitedCount: config.unlimited_stock,
                StackObjectsCount: config.stock_amount
            }
        });

        trader.assort.barter_scheme[templateId] = [[{
            count: config.price,
            _tpl: ROUBLES_ID
        }]];

        trader.assort.loyal_level_items[templateId] = config.trader_loyalty_level;
    }
}

module.exports = { mod: new Mod() };