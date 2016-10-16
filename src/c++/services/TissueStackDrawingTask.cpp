/*
 * This file is part of TissueStack.
 *
 * TissueStack is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * TissueStack is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with TissueStack.  If not, see <http://www.gnu.org/licenses/>.
 */
#include "networking.h"
#include "imaging.h"
#include "database.h"
#include "services.h"

tissuestack::services::TissueStackDrawingTask::TissueStackDrawingTask(
		const std::string id,
		const std::string input_file,
		const tissuestack::imaging::TissueStackRawDiff diff) : tissuestack::services::TissueStackTask(id, input_file)
{
	if (!this->isInputDataRaw())
		THROW_TS_EXCEPTION(tissuestack::common::TissueStackApplicationException,
			"Annotations must be a raw file.");

    const tissuestack::imaging::TissueStackImageData* image = tissuestack::imaging::TissueStackImageData::fromFile(input_file);
    const tissuestack::imaging::TissueStackRawData* raw = static_cast<const tissuestack::imaging::TissueStackRawData*>(image);

    raw->applyDiff(diff);
}


tissuestack::services::TissueStackDrawingTask::~TissueStackDrawingTask() {}


const tissuestack::services::TissueStackTaskType tissuestack::services::TissueStackDrawingTask::getType() const
{
	return tissuestack::services::TissueStackTaskType::DRAWING;
}

void tissuestack::services::TissueStackDrawingTask::dumpTaskToDebugLog() const
{
	tissuestack::logging::TissueStackLogger::instance()->debug(
			"Drawing Task: %s\n",
			this->getInputImageData()->getFileName().c_str());
}
