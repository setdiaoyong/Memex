import React, { PureComponent } from 'react'
import { connect, MapStateToProps } from 'react-redux'
import { MapDispatchToProps } from 'src/util/types'
import { RootState } from 'src/options/types'

import { Tooltip } from 'src/common-ui/components'
import DateRangeSelection from 'src/overview/search-bar/components/DateRangeSelection'
import FilterButton from './filter-button'
import { actions, selectors } from 'src/search-filters'
import {
    acts as searchBarActs,
    selectors as searchBar,
} from 'src/overview/search-bar'
import { acts as tooltipActs } from 'src/overview/tooltips'

import cx from 'classnames'

const styles = require('./dates-filter.css')

interface StateProps {
    startDate: number
    endDate: number
    startDateText: string
    endDateText: string
    datesFilterDropdown: boolean
}

interface DispatchProps {
    showDatesFilter: () => void
    hideDatesFilter: () => void
    onStartDateChange: (date: number) => void
    onEndDateChange: (date: number) => void
    onStartDateTextChange: (date: string) => void
    onEndDateTextChange: (date: string) => void
    changeTooltip: () => void
}

interface OwnProps {
    env: 'inpage' | 'overview'
    tooltipPosition: string
}

type Props = StateProps & DispatchProps & OwnProps

interface State {}

class DatesFilter extends PureComponent<Props, State> {
    togglePopup = () => {
        this.props.datesFilterDropdown
            ? this.props.hideDatesFilter()
            : this.props.showDatesFilter()
    }

    clearFilters = () => {
        this.props.onStartDateChange(undefined)
        this.props.onEndDateChange(undefined)
        this.props.onStartDateTextChange('')
        this.props.onEndDateTextChange('')
    }

    render() {
        return (
            <FilterButton
                source="Dates"
                filteredItems={[]}
                togglePopup={this.togglePopup}
                hidePopup={this.props.hideDatesFilter}
                clearFilters={this.clearFilters}
                startDate={this.props.startDate}
                endDate={this.props.endDate}
            >
                {this.props.datesFilterDropdown && (
                    <Tooltip
                        position={this.props.tooltipPosition}
                        itemClass={cx({
                            [styles.tooltip]: this.props.env === 'overview',
                            [styles.inpagetooltip]: this.props.env === 'inpage',
                        })}
                    >
                        <DateRangeSelection
                            env={this.props.env}
                            startDate={this.props.startDate}
                            endDate={this.props.endDate}
                            startDateText={this.props.startDateText}
                            endDateText={this.props.endDateText}
                            onStartDateChange={this.props.onStartDateChange}
                            onEndDateChange={this.props.onEndDateChange}
                            onStartDateTextChange={
                                this.props.onStartDateTextChange
                            }
                            onEndDateTextChange={this.props.onEndDateTextChange}
                            disabled={false}
                            changeTooltip={this.props.changeTooltip}
                        />
                    </Tooltip>
                )}
            </FilterButton>
        )
    }
}

const mapStateToProps: MapStateToProps<StateProps, OwnProps, RootState> = (
    state,
): StateProps => ({
    startDate: searchBar.startDate(state),
    endDate: searchBar.endDate(state),
    startDateText: searchBar.startDateText(state),
    endDateText: searchBar.endDateText(state),
    datesFilterDropdown: selectors.datesFilter(state),
})

const mapDispatchToProps: MapDispatchToProps<
    DispatchProps,
    OwnProps,
    RootState
> = dispatch => ({
    onStartDateChange: date => dispatch(searchBarActs.setStartDate(date)),
    onEndDateChange: date => dispatch(searchBarActs.setEndDate(date)),
    onStartDateTextChange: date =>
        dispatch(searchBarActs.setStartDateText(date)),
    onEndDateTextChange: date => dispatch(searchBarActs.setEndDateText(date)),
    showDatesFilter: () => dispatch(actions.showDatesFilter()),
    hideDatesFilter: () => dispatch(actions.hideDatesFilter()),
    changeTooltip: () => {
        // Change tooltip notification to more filters once the user selects date
        dispatch(tooltipActs.setTooltip('more-filters'))
    },
})

export default connect(
    mapStateToProps,
    mapDispatchToProps,
)(DatesFilter)
